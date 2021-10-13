package herdado;

public class TesteGerente {
	public static void main(String[] args) {
		Gerente g1 = new Gerente();
		g1.setNome("Marco");
		g1.setCpf("165498546");
		g1.setSalario(5000.0);
		
		System.out.println(g1.getNome());
		
	}
}
