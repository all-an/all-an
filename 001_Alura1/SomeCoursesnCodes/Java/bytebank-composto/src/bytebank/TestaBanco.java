package bytebank;

public class TestaBanco {
	public static void main(String[] args) {
		Cliente paulo = new Cliente();
		
		paulo.nome = "Paulo Silveira";
		paulo.cpf = "111.111.111-11";
		paulo.profissao = "programador";
		
		Conta contaDoPaulo = new Conta();
		
		contaDoPaulo.deposita(100); //retorno de um método
		
		//associando o objeto Cliente paulo a Conta contaDoPaulo 
		contaDoPaulo.titular = paulo;
		
		System.out.println(contaDoPaulo.titular.nome);
		System.out.println(contaDoPaulo.titular);
		System.out.println(paulo);  
		
	}
}
