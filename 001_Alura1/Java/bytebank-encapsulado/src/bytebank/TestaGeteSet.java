package bytebank;

public class TestaGeteSet {
	public static void main(String[] args) {
		Conta novaConta = new Conta(42, 6);
		
		//novaConta.setNumero(123); << n�o precisa mais setar o numero da conta, passado como argumento no construtor acima
		
		//conta.numero = 123; n�o funciona, tem que chamar o m�todo setNumero
		
		System.out.println(novaConta.getNumero());
		
		Cliente paulo = new Cliente();
		
		//novaConta.titular = paulo; //criando objeto paulo
		
		paulo.setNome("Paulo Silveira"); //nome � atributo do objeto paulo
		
		novaConta.setTitular(paulo);
		
		paulo.setCpf("teste"); //cpf como string ?
		 
		Cliente titularDaConta = new Cliente();
		
		titularDaConta = paulo;
		
		novaConta.setTitular(titularDaConta); 
		
		titularDaConta.setProfissao("Programador");
		
		System.out.println(novaConta.getTitular().getNome());
		
		novaConta.getTitular().setProfissao("Programador");
		
		System.out.println(titularDaConta);
		System.out.println(paulo);
		System.out.println(novaConta.getTitular());
	}
}
